/**
 * Minimal in-memory stand-in for a single DynamoDB table, driven through the
 * `dynamoDoc.send(command)` surface used by the backend. It understands just enough of
 * the expression language used in this codebase (Get/Query/Scan/Put/Delete/Update and
 * TransactWrite with `attribute_exists`, `attribute_not_exists`, `=` conditions and
 * `SET`/`ADD`/`REMOVE` updates) to let tests assert on the resulting table state instead
 * of on the exact sequence of commands.
 */

type Item = Record<string, unknown>;

interface CommandLike {
  constructor: { name: string };
  input: Record<string, unknown>;
}

export interface CancellationReason {
  Code: string;
  Message?: string;
}

export class TransactionCanceledError extends Error {
  CancellationReasons: CancellationReason[];

  constructor(reasons: CancellationReason[]) {
    super('Transaction cancelled');
    this.name = 'TransactionCanceledException';
    this.CancellationReasons = reasons;
  }
}

const keyOf = (pk: unknown, sk: unknown): string => `${String(pk)}\u0000${String(sk)}`;

const resolveName = (raw: string, names: Record<string, string> | undefined): string =>
  raw.startsWith('#') ? (names?.[raw] ?? raw) : raw;

const evaluateCondition = (
  expression: string | undefined,
  item: Item | undefined,
  names: Record<string, string> | undefined,
  values: Record<string, unknown> | undefined
): boolean => {
  if (!expression) {
    return true;
  }

  return expression.split(/\s+AND\s+/i).every((rawTerm) => {
    const term = rawTerm.trim().replace(/^\((.*)\)$/, '$1').trim();

    const notExists = /^attribute_not_exists\((.+)\)$/.exec(term);
    if (notExists) {
      return item === undefined || item[resolveName(notExists[1]!.trim(), names)] === undefined;
    }

    const exists = /^attribute_exists\((.+)\)$/.exec(term);
    if (exists) {
      return item !== undefined && item[resolveName(exists[1]!.trim(), names)] !== undefined;
    }

    const equals = /^(\S+)\s*=\s*(:\S+)$/.exec(term);
    if (equals) {
      return item !== undefined && item[resolveName(equals[1]!, names)] === values?.[equals[2]!];
    }

    const notEquals = /^(\S+)\s*<>\s*(:\S+)$/.exec(term);
    if (notEquals) {
      return item !== undefined && item[resolveName(notEquals[1]!, names)] !== values?.[notEquals[2]!];
    }

    throw new Error(`FakeDynamoTable: unsupported condition term "${term}"`);
  });
};

const splitTopLevel = (input: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
};

const evaluateOperand = (
  raw: string,
  item: Item,
  names: Record<string, string> | undefined,
  values: Record<string, unknown> | undefined
): unknown => {
  const operand = raw.trim();
  const ifNotExists = /^if_not_exists\((.+),\s*(:\S+)\)$/.exec(operand);
  if (ifNotExists) {
    const existing = item[resolveName(ifNotExists[1]!.trim(), names)];
    return existing !== undefined ? existing : values?.[ifNotExists[2]!];
  }
  if (operand.startsWith(':')) {
    return values?.[operand];
  }
  return item[resolveName(operand, names)];
};

const evaluateSetValue = (
  raw: string,
  item: Item,
  names: Record<string, string> | undefined,
  values: Record<string, unknown> | undefined
): unknown => {
  const plusParts = splitTopLevel(raw, '+');
  if (plusParts.length > 1) {
    return plusParts.reduce(
      (sum, part) => sum + Number(evaluateOperand(part, item, names, values) ?? 0),
      0
    );
  }
  const minusParts = splitTopLevel(raw, '-');
  if (minusParts.length === 2) {
    return (
      Number(evaluateOperand(minusParts[0]!, item, names, values) ?? 0) -
      Number(evaluateOperand(minusParts[1]!, item, names, values) ?? 0)
    );
  }
  return evaluateOperand(raw, item, names, values);
};

const applyUpdate = (
  current: Item | undefined,
  key: Item,
  expression: string,
  names: Record<string, string> | undefined,
  values: Record<string, unknown> | undefined
): Item => {
  const next: Item = { ...(current ?? key) };
  const clauses = expression.match(/(SET|ADD|REMOVE)\s+[^]*?(?=\s+(?:SET|ADD|REMOVE)\s+|$)/g) ?? [];

  for (const clause of clauses) {
    const [, verb, rest] = /^(SET|ADD|REMOVE)\s+([^]*)$/.exec(clause.trim()) ?? [];
    for (const part of splitTopLevel(rest ?? '', ',')) {
      if (verb === 'SET') {
        const [, rawPath, rawValue] = /^(\S+)\s*=\s*([^]+)$/.exec(part) ?? [];
        next[resolveName(rawPath!, names)] = evaluateSetValue(rawValue!, next, names, values);
      } else if (verb === 'ADD') {
        const [, rawPath, rawValue] = /^(\S+)\s+(:\S+)$/.exec(part) ?? [];
        const path = resolveName(rawPath!, names);
        next[path] = Number(next[path] ?? 0) + Number(values?.[rawValue!] ?? 0);
      } else if (verb === 'REMOVE') {
        delete next[resolveName(part, names)];
      }
    }
  }

  return next;
};

export class FakeDynamoTable {
  private items = new Map<string, Item>();

  /** Names of every write command that was applied successfully (a failed condition is not recorded). */
  writes: string[] = [];

  /** Every command seen, in order. */
  commands: CommandLike[] = [];

  /**
   * Optional hook invoked before each command is executed. Tests use it to inject delays
   * (to force interleavings) or to throw synthetic errors such as transaction conflicts.
   */
  beforeCommand: ((command: CommandLike) => Promise<void> | void) | null = null;

  seed(items: readonly object[]): void {
    for (const raw of items) {
      const item = raw as Item;
      this.items.set(keyOf(item.PK, item.SK), { ...item });
    }
  }

  get<T extends object = Item>(pk: string, sk: string): T | undefined {
    const item = this.items.get(keyOf(pk, sk));
    return item ? ({ ...item } as T) : undefined;
  }

  all(): Item[] {
    return [...this.items.values()]
      .map((item) => ({ ...item }))
      .sort((a, b) =>
        String(a.PK).localeCompare(String(b.PK)) || String(a.SK).localeCompare(String(b.SK))
      );
  }

  itemsWhere<T extends object = Item>(predicate: (item: Item) => boolean): T[] {
    return this.all().filter(predicate) as T[];
  }

  /** Bind as `dynamoDoc.send` in a vi.mock of `../lib/clients.js`. */
  send = async (command: unknown): Promise<unknown> => {
    const typed = command as CommandLike;
    this.commands.push(typed);
    if (this.beforeCommand) {
      await this.beforeCommand(typed);
    }

    switch (typed.constructor.name) {
      case 'GetCommand':
        return this.handleGet(typed.input);
      case 'QueryCommand':
        return this.handleQuery(typed.input);
      case 'ScanCommand':
        return this.handleScan(typed.input);
      case 'PutCommand':
      case 'DeleteCommand':
      case 'UpdateCommand':
      case 'TransactWriteCommand': {
        const result = this.handleWrite(typed);
        this.writes.push(typed.constructor.name);
        return result;
      }
      default:
        throw new Error(`FakeDynamoTable: unsupported command ${typed.constructor.name}`);
    }
  };

  private handleWrite(command: CommandLike): Record<string, never> {
    switch (command.constructor.name) {
      case 'PutCommand':
        return this.handlePut(command.input);
      case 'DeleteCommand':
        return this.handleDelete(command.input);
      case 'UpdateCommand':
        return this.handleUpdate(command.input);
      default:
        return this.handleTransactWrite(command.input);
    }
  }

  private handleGet(input: Record<string, unknown>): { Item?: Item } {
    const key = input.Key as Item;
    const item = this.items.get(keyOf(key.PK, key.SK));
    return item ? { Item: { ...item } } : {};
  }

  private handleQuery(input: Record<string, unknown>): { Items: Item[]; LastEvaluatedKey?: Item } {
    const values = input.ExpressionAttributeValues as Record<string, unknown>;
    const condition = String(input.KeyConditionExpression);
    const pkMatch = /PK\s*=\s*(:\S+)/.exec(condition);
    const prefixMatch = /begins_with\(SK,\s*(:\S+)\)/.exec(condition);
    if (!pkMatch) {
      throw new Error(`FakeDynamoTable: unsupported KeyConditionExpression "${condition}"`);
    }

    const pk = values[pkMatch[1]!];
    const prefix = prefixMatch ? String(values[prefixMatch[1]!]) : '';

    const matching = this.all().filter(
      (item) => item.PK === pk && String(item.SK).startsWith(prefix)
    );

    return this.paginate(matching, input);
  }

  private handleScan(input: Record<string, unknown>): { Items: Item[]; LastEvaluatedKey?: Item } {
    const names = input.ExpressionAttributeNames as Record<string, string> | undefined;
    const values = input.ExpressionAttributeValues as Record<string, unknown> | undefined;
    const filter = input.FilterExpression as string | undefined;
    const matching = this.all().filter((item) => evaluateCondition(filter, item, names, values));
    return this.paginate(matching, input);
  }

  private paginate(
    sorted: Item[],
    input: Record<string, unknown>
  ): { Items: Item[]; LastEvaluatedKey?: Item } {
    const start = input.ExclusiveStartKey as Item | undefined;
    let startIndex = 0;
    if (start) {
      const index = sorted.findIndex((item) => item.PK === start.PK && item.SK === start.SK);
      startIndex = index >= 0 ? index + 1 : sorted.length;
    }

    const limit = typeof input.Limit === 'number' ? input.Limit : sorted.length;
    const page = sorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < sorted.length;
    const last = page[page.length - 1];

    return {
      Items: page,
      ...(hasMore && last ? { LastEvaluatedKey: { PK: last.PK, SK: last.SK } } : {})
    };
  }

  private conditionHolds(
    key: Item,
    input: {
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    }
  ): boolean {
    return evaluateCondition(
      input.ConditionExpression,
      this.items.get(keyOf(key.PK, key.SK)),
      input.ExpressionAttributeNames,
      input.ExpressionAttributeValues
    );
  }

  private handlePut(input: Record<string, unknown>): Record<string, never> {
    const item = input.Item as Item;
    if (!this.conditionHolds(item, input)) {
      throw Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException'
      });
    }

    this.items.set(keyOf(item.PK, item.SK), { ...item });
    return {};
  }

  private handleDelete(input: Record<string, unknown>): Record<string, never> {
    const key = input.Key as Item;
    if (!this.conditionHolds(key, input)) {
      throw Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException'
      });
    }

    this.items.delete(keyOf(key.PK, key.SK));
    return {};
  }

  private handleUpdate(input: Record<string, unknown>): Record<string, never> {
    const key = input.Key as Item;
    if (!this.conditionHolds(key, input)) {
      throw Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException'
      });
    }

    const current = this.items.get(keyOf(key.PK, key.SK));
    this.items.set(
      keyOf(key.PK, key.SK),
      applyUpdate(
        current,
        key,
        String(input.UpdateExpression),
        input.ExpressionAttributeNames as Record<string, string> | undefined,
        input.ExpressionAttributeValues as Record<string, unknown> | undefined
      )
    );
    return {};
  }

  private handleTransactWrite(input: Record<string, unknown>): Record<string, never> {
    const transactItems = input.TransactItems as Array<Record<string, Record<string, unknown>>>;

    const reasons: CancellationReason[] = transactItems.map((transactItem) => {
      const operation = transactItem.Put ?? transactItem.Delete ?? transactItem.Update ?? transactItem.ConditionCheck;
      if (!operation) {
        throw new Error('FakeDynamoTable: unsupported TransactItem');
      }

      const key = (operation.Key ?? operation.Item) as Item;
      return this.conditionHolds(key, operation)
        ? { Code: 'None' }
        : { Code: 'ConditionalCheckFailed', Message: 'The conditional request failed' };
    });

    if (reasons.some((reason) => reason.Code !== 'None')) {
      throw new TransactionCanceledError(reasons);
    }

    for (const transactItem of transactItems) {
      if (transactItem.Put) {
        const item = transactItem.Put.Item as Item;
        this.items.set(keyOf(item.PK, item.SK), { ...item });
      } else if (transactItem.Delete) {
        const key = transactItem.Delete.Key as Item;
        this.items.delete(keyOf(key.PK, key.SK));
      } else if (transactItem.Update) {
        const key = transactItem.Update.Key as Item;
        const current = this.items.get(keyOf(key.PK, key.SK));
        this.items.set(
          keyOf(key.PK, key.SK),
          applyUpdate(
            current,
            key,
            String(transactItem.Update.UpdateExpression),
            transactItem.Update.ExpressionAttributeNames as Record<string, string> | undefined,
            transactItem.Update.ExpressionAttributeValues as Record<string, unknown> | undefined
          )
        );
      }
    }

    return {};
  }
}
