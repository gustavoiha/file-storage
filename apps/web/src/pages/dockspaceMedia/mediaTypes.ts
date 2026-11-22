export type MediaGridSize = 'small' | 'medium' | 'large';

/** Outcome of a Find duplicates action: a clean trash result is info, an error or partial failure is error. */
export interface DuplicateActionMessage {
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
