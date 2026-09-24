import {
  migrateDuplicateFolders,
  migrateDuplicateFoldersForAllDockspaces
} from '../lib/migrateDuplicateFolders.js';

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
};

const run = async (): Promise<void> => {
  const dryRun = parseBoolean(process.env.BACKFILL_DRY_RUN, true);
  const pageSize = parseNumber(process.env.BACKFILL_PAGE_SIZE);
  const maxPages = parseNumber(process.env.BACKFILL_MAX_PAGES);
  const userId = process.env.MIGRATE_USER_ID?.trim();
  const dockspaceId = process.env.MIGRATE_DOCKSPACE_ID?.trim();

  if ((userId && !dockspaceId) || (!userId && dockspaceId)) {
    throw new Error('MIGRATE_USER_ID and MIGRATE_DOCKSPACE_ID must be provided together');
  }

  const options = {
    dryRun,
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(maxPages !== undefined ? { maxPages } : {})
  };

  // Default: every dockspace of every user, one partition at a time.
  // MIGRATE_USER_ID + MIGRATE_DOCKSPACE_ID restrict the run to a single dockspace.
  const result =
    userId && dockspaceId
      ? await migrateDuplicateFolders({ ...options, partition: { userId, dockspaceId } })
      : await migrateDuplicateFoldersForAllDockspaces(options);

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
};

await run();
