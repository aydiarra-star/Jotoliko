import type { Request } from "express";
import type { AppRole } from "../../../../lib/jotoliko-os/core";

export type AuthContext = {
  userId: string;
  companyId: string;
  role: AppRole;
};

export type AuthenticatedRequest = Request & { auth?: AuthContext };
