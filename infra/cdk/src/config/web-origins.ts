const webOriginByEnvironment: Record<string, string> = {
  dev: 'https://dockspace-dev.officiarte.it',
  prod: 'https://dockspace.officiarte.it'
};

export const resolveWebAppOrigins = (deploymentEnvironment: string): string[] => {
  const origin = webOriginByEnvironment[deploymentEnvironment];
  if (!origin) {
    throw new Error(
      `Unsupported ENVIRONMENT "${deploymentEnvironment}". Expected one of: ${Object.keys(webOriginByEnvironment).join(', ')}.`
    );
  }

  return [origin];
};
