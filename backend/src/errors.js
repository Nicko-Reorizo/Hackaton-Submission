export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { message: error.message, ...(error.code ? { code: error.code } : {}) } });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Image request is too large. Maximum image size is 8 MB.' } });
  }
  if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Request body must be valid JSON.' } });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ error: { message: 'Report data is invalid.' } });
  }
  // Do not print credentials, image data, tokens, or third-party response bodies.
  console.error('Request failed:', error.name || 'Error');
  return res.status(500).json({ error: { message: 'The server could not complete this request. Please try again.' } });
}
