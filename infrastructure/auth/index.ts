type Session = {
  user: { id: string };
  organizationId: string;
};

export async function getSession(request: Request): Promise<Session> {
  void request;

  // Stub for local development.
  // Replace with real better-auth integration later.
  return {
    user: { id: "user_dev" },
    organizationId: "org_dev",
  };
}
