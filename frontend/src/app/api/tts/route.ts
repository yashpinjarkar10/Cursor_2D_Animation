/**
 * Server-side proxy for Camb.ai Text-to-Speech.
 *
 * Uses the official @camb-ai/sdk (already installed) as documented at:
 * https://docs.camb.ai/sdk-guides/typescript-sdk
 *
 * POST /api/tts
 * Body: { text: string, language: string, voice_id: number }
 * Returns: audio/wav binary
 */
import { NextRequest, NextResponse } from 'next/server';
import { CambClient } from '@camb-ai/sdk';

// Lazily initialised singleton — avoids creating a new client per request.
let _client: InstanceType<typeof CambClient> | null = null;

function getClient(): InstanceType<typeof CambClient> {
  if (!_client) {
    const apiKey = process.env.CAMB_API_KEY;
    if (!apiKey) throw new Error('CAMB_API_KEY not configured');
    _client = new CambClient({ apiKey });
  }
  return _client;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, language, voice_id } = body as {
      text?: string;
      language?: string;
      voice_id?: number;
    };

    if (!text || text.length < 3) {
      return NextResponse.json({ error: 'Text must be at least 3 characters' }, { status: 400 });
    }
    if (!language) {
      return NextResponse.json({ error: 'Language is required' }, { status: 400 });
    }
    if (!voice_id) {
      return NextResponse.json({ error: 'voice_id is required' }, { status: 400 });
    }

    const client = getClient();

    // Call TTS using the SDK — exactly as documented in the TypeScript SDK quickstart.
    // https://docs.camb.ai/sdk-guides/typescript-sdk#streaming-text-to-speech
    // The SDK uses typed enums for language and speech_model, but the values are
    // the same BCP-47 strings (e.g. 'en-us', 'hi-in') we receive from the client.
    const response = await client.textToSpeech.tts({
      text,
      language: language as 'en-us',  // cast: SDK Language type is a union of string literals
      voice_id,
      speech_model: 'mars-8.1-flash-beta',
      output_configuration: {
        format: 'wav',
      },
    });

    // The SDK returns a BinaryResponse with .arrayBuffer(), .blob(), .stream() methods.
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const body = (error as { body?: unknown })?.body;
    console.error('TTS API error:', message, body || '');
    return NextResponse.json({ error: message, details: body }, { status: 500 });
  }
}
