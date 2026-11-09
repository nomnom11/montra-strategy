type MetadataInput = {
  file: File;
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
};

type UploadResult = {
  imageUri: string;
  metadataUri: string;
};

const API = "";

async function readResponse(response: Response) {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || response.statusText);
  }

  return body;
}

export async function uploadTokenMetadata(
  input: MetadataInput
): Promise<UploadResult> {
  const { file, name, symbol, description, website, twitter } = input;

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    throw new Error("Unsupported logo format.");
  }

  const image = await fetch(`${API}/api/metadata/image`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file
  }).then(readResponse);

  if (typeof image.uri !== "string" || !image.uri) {
    throw new Error("Image upload returned no URI.");
  }

  const metadata = await fetch(`${API}/api/metadata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      symbol,
      description,
      image: image.uri,
      ...(website ? { website } : {}),
      ...(twitter ? { twitter } : {})
    })
  }).then(readResponse);

  if (typeof metadata.uri !== "string" || !metadata.uri) {
    throw new Error("Metadata upload returned no URI.");
  }

  return {
    imageUri: image.uri,
    metadataUri: metadata.uri
  };
}
