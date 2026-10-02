/** Safe, deliberately user-facing business validation failure. */
export class BusinessError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
