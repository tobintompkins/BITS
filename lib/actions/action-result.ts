/**
 * Typed helpers for server-action results.
 * Prefer these for new actions; existing actions may keep ad-hoc shapes.
 */

export type ActionSuccess<T extends Record<string, unknown> = Record<string, never>> = {
  status: "success";
  message: string;
} & T;

export type ActionError<
  TFieldErrors extends Record<string, string[] | undefined> = Record<
    string,
    string[] | undefined
  >,
> = {
  status: "error";
  message: string;
  fieldErrors?: TFieldErrors;
};

export type ActionResult<
  TSuccess extends Record<string, unknown> = Record<string, never>,
  TFieldErrors extends Record<string, string[] | undefined> = Record<
    string,
    string[] | undefined
  >,
> = ActionSuccess<TSuccess> | ActionError<TFieldErrors>;

export function actionSuccess<T extends Record<string, unknown> = Record<string, never>>(
  message: string,
  extra?: T,
): ActionSuccess<T> {
  return { status: "success", message, ...(extra ?? ({} as T)) };
}

export function actionError<
  TFieldErrors extends Record<string, string[] | undefined> = Record<
    string,
    string[] | undefined
  >,
>(message: string, fieldErrors?: TFieldErrors): ActionError<TFieldErrors> {
  return fieldErrors
    ? { status: "error", message, fieldErrors }
    : { status: "error", message };
}
