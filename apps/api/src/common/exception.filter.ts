import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Filtre d'exception global.
 *
 * Trois responsabilités, et une seule raison d'être : une réponse d'erreur ne
 * doit ni mentir sur sa cause, ni divulguer l'intérieur du service.
 *
 *  1. Une `HttpException` est relayée telle quelle (statut et corps inchangés),
 *     en y ajoutant l'identifiant de corrélation. C'est par ce chemin que
 *     passent les refus métier et la validation — leurs messages sont rédigés
 *     pour l'appelant et n'exposent rien d'interne.
 *  2. Une erreur du transport (JSON illisible, charge trop lourde) que NestJS
 *     n'aurait pas déjà convertie devient un `400`/`413` explicite : un corps
 *     illisible est une requête fautive, pas une panne serveur. Le cas est
 *     conservé en défense, même si la version actuelle de Nest le traite.
 *  3. Toute autre erreur devient un `500` volontairement muet : la cause exacte
 *     (pile d'appels, message du moteur de base, nom de colonne) part dans les
 *     journaux du serveur, jamais dans la réponse HTTP.
 */
type TransportError = {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

const TRANSPORT_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "Corps de requête illisible (JSON invalide)",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "Charge utile trop lourde",
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: "Type de contenu non pris en charge",
};

function transportStatus(exception: unknown): number | null {
  if (typeof exception !== "object" || exception === null) return null;
  const candidate = exception as TransportError;
  // `type` est posé par body-parser : c'est ce qui distingue une erreur de
  // transport d'une erreur métier qui porterait par hasard un `status`.
  if (typeof candidate.type !== "string") return null;
  const raw = candidate.status ?? candidate.statusCode;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < 400 || raw > 499) return null;
  return raw;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const correlation = request.requestId ?? null;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        response.status(status).json({ statusCode: status, message: body });
        return;
      }
      const payload = body as Record<string, unknown>;
      response.status(status).json(correlation ? { ...payload, requestId: correlation } : payload);
      return;
    }

    const status = transportStatus(exception);
    if (status !== null) {
      this.logger.warn(
        `Requête rejetée (${status}) sur ${request.method} ${request.originalUrl ?? request.url} [${correlation ?? "sans identifiant"}]`
      );
      response.status(status).json({
        statusCode: status,
        message: TRANSPORT_MESSAGES[status] ?? "Requête invalide",
        requestId: correlation,
      });
      return;
    }

    // Cause réelle côté serveur uniquement.
    this.logger.error(
      `Erreur non gérée sur ${request.method} ${request.originalUrl ?? request.url} [${correlation ?? "sans identifiant"}]`,
      exception instanceof Error ? exception.stack : String(exception)
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Erreur interne",
      requestId: correlation,
    });
  }
}
