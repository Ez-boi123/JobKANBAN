import { Buffer } from "node:buffer";
import { validEmail } from "../../shared/reminders.mjs";

export class MailError extends Error {
  kind: "retryable" | "failed" | "unknown";
  constructor(kind: "retryable" | "failed" | "unknown") {
    super(kind);
    this.kind = kind;
  }
}
type Mail = {
  user: string;
  code: string;
  to: string;
  subject: string;
  text: string;
  id: string;
};
type Connection = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
};
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
// Native Workers TLS sockets avoid relying on Node mail-library compatibility.
// The supplied connect function must use implicit TLS with certificate validation.
export async function sendSmtp(
  mail: Mail,
  connect: () => Connection,
): Promise<void> {
  if (
    !validEmail(mail.user) ||
    !mail.user.endsWith("@163.com") ||
    !validEmail(mail.to) ||
    !mail.code ||
    /[\r\n]/.test(mail.id)
  )
    throw new MailError("failed");
  let socket: Connection;
  try {
    socket = connect();
  } catch {
    throw new MailError("retryable");
  }
  const reader = socket.readable.getReader(),
    writer = socket.writable.getWriter();
  let buffer = "",
    bytes = 0,
    dataStarted = false;
  const decoder = new TextDecoder();
  async function reply(expected: number[]) {
    for (;;) {
      const newline = buffer.indexOf("\r\n");
      if (newline < 0) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("closed");
        bytes += chunk.value.byteLength;
        if (bytes > 65536) throw new Error("oversized response");
        buffer += decoder.decode(chunk.value, { stream: true });
        continue;
      }
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      if (!/^\d{3}[ -]/.test(line)) throw new Error("invalid SMTP response");
      if (line[3] === "-") continue;
      const status = Number(line.slice(0, 3));
      if (!expected.includes(status))
        throw new MailError(
          status >= 400 && status < 500 ? "retryable" : "failed",
        );
      return;
    }
  }
  async function command(text: string, expected: number[]) {
    await writer.write(new TextEncoder().encode(text + "\r\n"));
    await reply(expected);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await reply([220]);
        await command("EHLO jobkanban.local", [250]);
        await command("AUTH LOGIN", [334]);
        await command(b64(mail.user), [334]);
        await command(b64(mail.code), [235]);
        await command(`MAIL FROM:<${mail.user}>`, [250]);
        await command(`RCPT TO:<${mail.to}>`, [250, 251]);
        await command("DATA", [354]);
        const body =
          b64(mail.text)
            .match(/.{1,76}/g)
            ?.join("\r\n") || "";
        const message = [
          `From: JobKANBAN <${mail.user}>`,
          `To: <${mail.to}>`,
          `Subject: =?UTF-8?B?${b64(mail.subject)}?=`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${mail.id}@163.com>`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "Content-Transfer-Encoding: base64",
          "",
          body,
          ".",
          "",
        ].join("\r\n");
        dataStarted = true;
        await writer.write(new TextEncoder().encode(message));
        await reply([250]); // Only a positive post-DATA response confirms acceptance.
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 20000);
      }),
    ]);
  } catch (error) {
    if (error instanceof MailError) throw error;
    throw new MailError(dataStarted ? "unknown" : "retryable");
  } finally {
    clearTimeout(timer);
    await socket.close().catch(() => {});
  }
}
