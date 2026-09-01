/**
 * Parses the CLI's `--output-format stream-json` event stream.
 *
 * We ask for JSON rather than text purely to get the final `result` event,
 * which is the only place per-run cost and token usage are reported. The
 * trade-off is that the console text has to be reassembled here.
 */
export function createStreamParser({ onText, onNotice, onResult }) {
  let buffer = "";
  let streamedText = false;

  function handle(event) {
    switch (event.type) {
      case "assistant": {
        for (const block of event.message?.content ?? []) {
          if (block.type === "text" && block.text) {
            streamedText = true;
            onText(block.text);
          } else if (block.type === "tool_use") {
            onNotice(`⚙ ${block.name}`);
          }
          // "thinking" blocks are deliberately dropped — they are long, and
          // showing them would bury the actual answer.
        }
        break;
      }
      case "user": {
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_result" && block.is_error) {
            onNotice("⚠ tool call failed");
          }
        }
        break;
      }
      case "result": {
        // `result` repeats the assistant's final message verbatim, so only use
        // it when nothing was streamed — otherwise the answer prints twice.
        if (!streamedText && typeof event.result === "string" && event.result) {
          onText(event.result);
        }
        onResult({
          costUsd: event.total_cost_usd ?? null,
          durationMs: event.duration_ms ?? null,
          numTurns: event.num_turns ?? null,
          isError: Boolean(event.is_error),
          sessionId: event.session_id ?? null,
          usage: {
            input: event.usage?.input_tokens ?? 0,
            output: event.usage?.output_tokens ?? 0,
            cacheRead: event.usage?.cache_read_input_tokens ?? 0,
            cacheWrite: event.usage?.cache_creation_input_tokens ?? 0,
          },
          models: Object.keys(event.modelUsage ?? {}),
        });
        break;
      }
      default:
        // system/init, thinking_tokens, stream deltas — nothing to show.
        break;
    }
  }

  return {
    /** Feed a decoded stdout chunk. Lines that are not JSON are passed through. */
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith("{")) {
          onText(line + "\n");
          continue;
        }
        try {
          handle(JSON.parse(trimmed));
        } catch {
          // Never swallow output because it failed to parse.
          onText(line + "\n");
        }
      }
    },
    /** Flush a trailing partial line at process exit. */
    end() {
      if (buffer.trim()) {
        onText(buffer);
        buffer = "";
      }
    },
  };
}
