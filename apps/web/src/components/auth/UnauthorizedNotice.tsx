import { Card } from '@/components/ui/Card';

export const UnauthorizedNotice = () => (
  <Card title="Not Authorized">
    <p>This account is authenticated but not entitled to use Dockspace.</p>
    <p>Ask the administrator to grant access for your email.</p>
  </Card>
);
