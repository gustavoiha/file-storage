import { backfillFileContentHash } from '../lib/backfillFileContentHash.js';

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
  const options: {
    dryRun: boolean;
    pageSize?: number;
    maxPages?: number;
  } = {
    dryRun
  };

  if (pageSize !== undefined) {
    options.pageSize = pageSize;
  }

  if (maxPages !== undefined) {
    options.maxPages = maxPages;
  }

  const modeLabel = dryRun ? 'DRY RUN' : 'WRITE';
  const result = await backfillFileContentHash({
    ...options,
    onProgress: (progress) => {
      if (progress.status === 'page') {
        console.log(
          `[${modeLabel}] page=${progress.pageCount} scanned=${progress.scannedCount} eligible=${progress.eligibleCount} updated=${progress.updatedCount} missing=${progress.missingObjectCount} failed=${progress.failedCount}`
        );
        return;
      }

      if (progress.status === 'updated') {
        console.log(
          `[${modeLabel}] updated=${progress.updatedCount} key=${progress.key ?? 'unknown'}`
        );
        return;
      }

      if (progress.status === 'missing-object') {
        console.log(
          `[${modeLabel}] missing-object key=${progress.key ?? 'unknown'} missingCount=${progress.missingObjectCount}`
        );
        return;
      }

      if (progress.status === 'failed') {
        console.log(
          `[${modeLabel}] failed key=${progress.key ?? 'unknown'} failedCount=${progress.failedCount}`
        );
      }
    }
  });
  console.log(JSON.stringify(result, null, 2));
};

await run();
