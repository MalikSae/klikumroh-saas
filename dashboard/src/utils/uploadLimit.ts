// The Go upload handlers cap the WHOLE request body with http.MaxBytesReader (e.g. 8<<20 for package photos
// in internal/handler/dashboard_package_photo.go), and that body is multipart: boundary lines and part
// headers come on top of the file. Checking only file.size lets a file just under the limit pass here and
// then be rejected by the server, so the client check counts the framing too.

export const MB = 1024 * 1024;

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Upper bound of the multipart bytes around one file part:
 *   "--B\r\n" + 'Content-Disposition: form-data; name="F"; filename="N"\r\n' + "Content-Type: T\r\n\r\n"
 *   + file + "\r\n--B--\r\n"
 * = 2B + 84 + F + N + T bytes, with B (the boundary) at most 70 per RFC 2046. The filename is counted three
 * times over for browsers that percent-encode or escape it.
 */
export const multipartOverhead = (fieldName: string, file: { name: string; type: string }): number =>
  2 * 70 + 84 + utf8Bytes(fieldName) + 3 * utf8Bytes(file.name) + utf8Bytes(file.type);

/** True when a single-file multipart upload of this file fits in a server body limit of limitBytes. */
export const fitsUploadLimit = (file: { name: string; type: string; size: number }, fieldName: string, limitBytes: number): boolean =>
  file.size + multipartOverhead(fieldName, file) <= limitBytes;
