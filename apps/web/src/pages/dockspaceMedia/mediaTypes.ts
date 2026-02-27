export type MediaGridSize = 'small' | 'medium' | 'large';

export interface DuplicateGroupSelection {
  keeperFileNodeId: string;
  selectedForTrashFileNodeIds: string[];
}

export interface MediaSelectionOptions {
  shiftKey?: boolean;
  itemIndex?: number;
}
