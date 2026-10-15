import { SetMetadata } from "@nestjs/common";
import { AppRole } from "./auth.types";
export const Roles = (...roles: AppRole[]) => SetMetadata("roles", roles);
