import {
  ResponseError,
  type PublicConsentDTO,
  type PublicConsentSignRequestDTO,
  type PublicConsentSignResponseDTO,
  type PublicFormDTO,
  type PublicFormDraftResponseDTO,
  type PublicFormSubmitResponseDTO,
} from '@allomed-api/core-service-public-api';
import { createPublicConsentsApi, createPublicFormsApi } from './allomed-api';

export class PublicClinicalRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function toRequestError(error: unknown, fallbackMessage: string) {
  if (error instanceof ResponseError) {
    let message = fallbackMessage;
    try {
      const payload = (await error.response.json()) as
        | { message?: string; detail?: string; title?: string }
        | undefined;
      message =
        payload?.message ||
        payload?.detail ||
        payload?.title ||
        `${fallbackMessage} (HTTP ${error.response.status}).`;
    } catch {
      message = `${fallbackMessage} (HTTP ${error.response.status}).`;
    }
    return new PublicClinicalRequestError(message, error.response.status);
  }
  return new PublicClinicalRequestError(fallbackMessage);
}

export async function getPublicForm(token: string): Promise<PublicFormDTO> {
  try {
    return await createPublicFormsApi().publicFormsGet({ token });
  } catch (error) {
    throw await toRequestError(error, 'This form link is not available.');
  }
}

export async function savePublicFormDraft({
  token,
  answers,
}: {
  token: string;
  answers: Record<string, unknown>;
}): Promise<PublicFormDraftResponseDTO> {
  try {
    return await createPublicFormsApi().publicFormsSaveDraft({
      token,
      publicFormDraftRequestDTO: { answers },
    });
  } catch (error) {
    throw await toRequestError(error, 'Unable to save progress.');
  }
}

export async function submitPublicForm({
  token,
  answers,
  submitterName,
  submittedByType,
}: {
  token: string;
  answers: Record<string, unknown>;
  submitterName?: string;
  submittedByType?: 'PATIENT' | 'REPRESENTATIVE';
}): Promise<PublicFormSubmitResponseDTO> {
  try {
    return await createPublicFormsApi().publicFormsSubmit({
      token,
      publicFormSubmitRequestDTO: {
        answers,
        submitterName,
        submittedByType,
      },
    });
  } catch (error) {
    throw await toRequestError(error, 'Unable to submit this form.');
  }
}

export async function getPublicConsent(token: string): Promise<PublicConsentDTO> {
  try {
    return await createPublicConsentsApi().publicConsentsGet({ token });
  } catch (error) {
    throw await toRequestError(error, 'This consent link is not available.');
  }
}

export async function signPublicConsent({
  token,
  request,
}: {
  token: string;
  request: PublicConsentSignRequestDTO;
}): Promise<PublicConsentSignResponseDTO> {
  try {
    return await createPublicConsentsApi().publicConsentsSign({
      token,
      publicConsentSignRequestDTO: request,
    });
  } catch (error) {
    throw await toRequestError(error, 'Unable to sign this consent.');
  }
}
