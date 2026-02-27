import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { FileViewerDialog } from '@/components/files/FileViewerDialog';
import { Page } from '@/components/ui/Page';
import { DockspaceMediaWorkspace } from '@/pages/dockspaceMedia/DockspaceMediaWorkspace';
import { useDockspaceMediaController } from '@/pages/dockspaceMedia/useDockspaceMediaController';

interface DockspaceMediaPageProps {
  dockspaceId: string;
  dockspaceName: string;
}

export const DockspaceMediaPage = ({ dockspaceId }: DockspaceMediaPageProps) => {
  const controller = useDockspaceMediaController({ dockspaceId });

  return (
    <RequireAuth>
      <Page className="page--dockspace">
        {controller.unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <DockspaceMediaWorkspace dockspaceId={dockspaceId} controller={controller} />
        )}
      </Page>
      <FileViewerDialog
        dockspaceId={dockspaceId}
        file={controller.viewerFile}
        isOpen={Boolean(controller.viewerFile)}
        thumbnailUrl={controller.viewerThumbnailUrl}
        onClose={controller.closePreview}
        variant="media-fullscreen"
        onPrevious={controller.openPreviousPreview}
        onNext={controller.openNextPreview}
        canPrevious={controller.canPreviewPrevious}
        canNext={controller.canPreviewNext}
      />
    </RequireAuth>
  );
};
