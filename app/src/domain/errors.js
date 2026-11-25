// A failure the user can act on (bad input, a gate that is not met). Anything else is an internal error.
export class DomainError extends Error {
  /** @param {string} code @param {string} message @param {object} [details] */
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
