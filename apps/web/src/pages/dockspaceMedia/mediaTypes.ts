export type MediaGridSize = 'small' | 'medium' | 'large';

/**
 * Outcome of a gallery or Find duplicates action, shown in an alert: a clean result is info, a request error or a
 * trash result with failed files is error.
 */
export interface MediaActionMessage {
  message: string;
  tone: 'error' | 'info';
}

export interface DuplicateGroupSelection {
  keeperFileNodeId: string;
  selectedForTrashFileNodeIds: string[];
}

export interface MediaSelectionOptions {
  shiftKey?: boolean;
  itemIndex?: number;
}
