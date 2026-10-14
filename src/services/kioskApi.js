const API = 'http://127.0.0.1:8000/api';

export async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data.detail === 'string' ? data.detail : 'Yêu cầu không thành công');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function printSession(imagePath, printFormat, copies = 1) {
  return request('/print', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path: imagePath, print_format: printFormat, copies })
  });
}

export function capturePose(sessionId, templateId, poseNumber) {
  return request('/capture', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, template_id: templateId, pose_number: poseNumber })
  });
}
