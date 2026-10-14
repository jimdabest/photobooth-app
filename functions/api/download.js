export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const fileUrl = url.searchParams.get('url');
  const requestedFilename = url.searchParams.get('filename') || 'photo.jpg';

  if (!fileUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(fileUrl);
  } catch {
    return new Response('Invalid file URL', { status: 400 });
  }

  // Only proxy public R2 images. This keeps the download endpoint from being
  // used to request arbitrary URLs from the Pages worker.
  if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname.endsWith('.r2.dev')) {
    return new Response('Unsupported file URL', { status: 400 });
  }

  const filename = requestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo.jpg';

  try {
    const response = await fetch(sourceUrl.toString());
    if (!response.ok || !response.body) {
      return new Response('File not found', { status: 404 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    return new Response(`Unable to download image: ${error.message}`, { status: 502 });
  }
}
