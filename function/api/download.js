export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const fileUrl = url.searchParams.get('url');
  const filename = url.searchParams.get('filename') || 'photo.jpg';

  if (!fileUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    // Fetch file từ R2
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new Response('File not found', { status: 404 });
    }

    // Trả về với header buộc browser tải file
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 });
  }
}