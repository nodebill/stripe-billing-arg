import type { auth } from "./auth";

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession["user"];
export type AuthUserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean;
};

export type ApiPrincipal =
  | {
      kind: "session";
      session: AuthSession;
      user: AuthUserRecord;
      apiKey: null;
    }
  | {
      kind: "api-key";
      session: null;
      user: AuthUserRecord;
      apiKey: {
        id: string;
        configId: string;
        referenceId: string;
        name: string | null;
      };
    };
