import type { Tool } from "@/lib/registry/tools";
import { PreviewNotice } from "./workspace/primitives";
import { StandardWorkspace } from "./workspace/StandardWorkspace";
import {
  AiPdfWorkspace,
  AudioTrimWorkspace,
  ResizeWorkspace,
  SpeechToTextWorkspace,
  TextToSpeechWorkspace,
} from "./workspace/SpecialWorkspaces";

export function ToolWorkspace({ tool }: { tool: Tool }) {
  let workspace = <StandardWorkspace tool={tool} />;

  if (tool.path === "/image/resize") workspace = <ResizeWorkspace tool={tool} />;
  if (tool.path === "/document/ai-editor") workspace = <AiPdfWorkspace tool={tool} />;
  if (tool.path === "/audio/trim") workspace = <AudioTrimWorkspace tool={tool} />;
  if (tool.path === "/audio/text-to-speech") workspace = <TextToSpeechWorkspace tool={tool} />;
  if (tool.path === "/audio/speech-to-text") workspace = <SpeechToTextWorkspace tool={tool} />;

  return (
    <section aria-label={`${tool.name} workspace`}>
      <PreviewNotice />
      {workspace}
    </section>
  );
}
