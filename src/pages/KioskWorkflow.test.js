import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Capture from './Capture';
import Review from './Review';
import Download from './Download';
import { capturePose, printSession, request } from '../services/kioskApi';

const mockNavigate = jest.fn();
let mockState;
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockState })
}));
jest.mock('../services/kioskApi', () => ({ capturePose: jest.fn(), printSession: jest.fn(), request: jest.fn() }));
jest.mock('qrcode.react', () => ({ QRCodeCanvas: () => <div>QR</div> }));

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    sessionId: 'test', imageUrl: '/photo.jpg', sessionUrl: 'https://example.com/photo/test',
    settings: { auto_print: false, enable_retake: true, max_print_copies: 10, review_timeout: 30 }, retakeCount: 0,
    templateId: 'tpl-a', template: { id: 'tpl-a' }
  };
  printSession.mockResolvedValue({ copies: 1 });
  request.mockImplementation(() => Promise.resolve(mockState.settings));
});
afterEach(() => jest.useRealTimers());

test('manual print submits selected copies and then opens ending screen', async () => {
  render(<Review />);
  fireEvent.click(screen.getByRole('button', { name: 'Tăng số bản' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp Tục & In Ảnh' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/download', expect.objectContaining({
    state: expect.objectContaining({ printQueued: true })
  })));
  expect(printSession).toHaveBeenCalledWith('test', 's4x6', 2);
});

test('save only navigates to download with saveOnly flag and without printing', async () => {
  await act(async () => {
    render(<Review />);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu Ảnh' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/download', expect.objectContaining({
    state: expect.objectContaining({ printQueued: false, saveOnly: true })
  })));
  expect(printSession).not.toHaveBeenCalled();
});

test('back button asks confirmation and cancels session', async () => {
  await act(async () => {
    render(<Review />);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Quay Lại' }));
  expect(screen.getByText('Hủy phiên chụp?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận quay lại' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/sessions/test/cancel', { method: 'POST' }));
  expect(mockNavigate).toHaveBeenCalledWith('/templates', { replace: true });
});

test('review timeout sends the default print request', async () => {
  jest.useFakeTimers();
  mockState.settings = { auto_print: true, review_timeout: 2 };
  render(<Review />);
  expect(screen.getByRole('button', { name: 'Tiếp Tục & In Ảnh' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tăng số bản' })).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  act(() => { jest.advanceTimersByTime(2000); });
  await act(async () => { await Promise.resolve(); });
  expect(printSession).toHaveBeenCalledWith('test', 's4x6', 1);
});

test('ending screen goes home after 15 seconds', () => {
  jest.useFakeTimers();
  mockState.printQueued = true;
  render(<Download />);
  expect(screen.getByText('Ảnh của bạn đang được in...')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(15000); });
  expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
});

test('offline ending screen renders a QR code', () => {
  mockState.settings = { offline_mode: true };
  render(<Download />);
  expect(screen.getByText('QR')).toBeInTheDocument();
});

test('ending screen displays save only visual when saveOnly is true', () => {
  mockState.saveOnly = true;
  mockState.printQueued = false;
  render(<Download />);
  expect(screen.getByText('Ảnh đã lưu thành công!')).toBeInTheDocument();
  expect(screen.getByText('QR')).toBeInTheDocument();
});

test('manual capture mode waits for shutter button press to start countdown', async () => {
  mockState.settings = { countdown_capture: 3, manual_capture: true };
  request.mockResolvedValue(mockState.settings);

  await act(async () => {
    render(<Capture />);
  });
  await act(async () => { await Promise.resolve(); });

  const liveViewImg = screen.getByAltText('Live View');
  act(() => {
    fireEvent.load(liveViewImg);
  });

  expect(screen.getByText('Chụp: Thủ công')).toBeInTheDocument();
  const shutterBtn = screen.getByRole('button', { name: 'BẤM ĐỂ CHỤP' });
  expect(shutterBtn).toBeInTheDocument();

  // Bấm nút chụp mới bắt đầu đếm ngược
  act(() => {
    fireEvent.click(shutterBtn);
  });

  expect(screen.getByText('3')).toBeInTheDocument();
});

test('toggle button switches between manual and auto capture modes', async () => {
  mockState.settings = { countdown_capture: 3, manual_capture: false };
  request.mockResolvedValue(mockState.settings);

  await act(async () => {
    render(<Capture />);
  });
  await act(async () => { await Promise.resolve(); });

  const liveViewImg = screen.getByAltText('Live View');
  act(() => {
    fireEvent.load(liveViewImg);
  });

  const modeToggle = screen.getByRole('button', { name: 'Chụp: Tự động' });
  expect(modeToggle).toBeInTheDocument();

  // Chuyển sang thủ công
  act(() => {
    fireEvent.click(modeToggle);
  });

  expect(screen.getByText('Chụp: Thủ công')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'BẤM ĐỂ CHỤP' })).toBeInTheDocument();
});

test('retake button opens modal and navigates to capture with selected poses', async () => {
  mockState.retakeCount = 0;
  mockState.settings = { enable_retake: true };
  request.mockResolvedValue(mockState.settings);

  await act(async () => {
    render(<Review />);
  });

  const retakeBtn = screen.getByRole('button', { name: '🔄 Chụp Lại' });
  expect(retakeBtn).toBeInTheDocument();

  fireEvent.click(retakeBtn);
  expect(screen.getByText('Chọn ảnh chụp lại')).toBeInTheDocument();

  // Chọn ảnh 1
  const pose1Btn = screen.getByRole('button', { name: 'Chọn ảnh số 1' });
  fireEvent.click(pose1Btn);

  const confirmBtn = screen.getByRole('button', { name: 'Bắt đầu chụp lại (1 ảnh)' });
  expect(confirmBtn).toBeInTheDocument();

  fireEvent.click(confirmBtn);
  expect(mockNavigate).toHaveBeenCalledWith('/capture', expect.objectContaining({
    replace: true,
    state: expect.objectContaining({
      retakePoses: [1],
      retakeCount: 1
    })
  }));
});

test('retake button is hidden when retakeCount is already 1 (only 1 retake allowed)', async () => {
  mockState.retakeCount = 1; // Đã chụp lại 1 lần
  mockState.settings = { enable_retake: true };
  request.mockResolvedValue(mockState.settings);

  await act(async () => {
    render(<Review />);
  });

  expect(screen.queryByRole('button', { name: '🔄 Chụp Lại' })).not.toBeInTheDocument();
});

test('capture displays interactive strip panel for multi-slot template', async () => {
  mockState.template = {
    id: 'tpl-multi',
    num_poses: 4,
    slots: [
      { pose_index: 1, x: 10, y: 10, width: 100, height: 100 },
      { pose_index: 2, x: 10, y: 120, width: 100, height: 100 },
      { pose_index: 3, x: 10, y: 230, width: 100, height: 100 },
      { pose_index: 4, x: 10, y: 340, width: 100, height: 100 }
    ],
    canvas_size: { width: 120, height: 450 }
  };
  mockState.templateId = 'tpl-multi';
  request.mockResolvedValue({ countdown_capture: 3, templates: [mockState.template] });

  await act(async () => {
    render(<Capture />);
  });

  expect(screen.getByLabelText('Khung ảnh xem trước')).toBeInTheDocument();
  expect(screen.getByText('Khung ảnh')).toBeInTheDocument();
});

test('retake multiple poses sequentially shoots pose 2 then pose 4', async () => {
  jest.useFakeTimers();
  mockState.sessionId = 'test-session-retake';
  mockState.retakePoses = [2, 4];
  mockState.template = {
    id: 'tpl-multi',
    num_poses: 4,
    slots: [
      { pose_index: 1, x: 10, y: 10, width: 100, height: 100 },
      { pose_index: 2, x: 10, y: 120, width: 100, height: 100 },
      { pose_index: 3, x: 10, y: 230, width: 100, height: 100 },
      { pose_index: 4, x: 10, y: 340, width: 100, height: 100 }
    ],
    canvas_size: { width: 120, height: 450 }
  };
  mockState.templateId = 'tpl-multi';
  mockState.settings = { countdown_capture: 1, manual_capture: true };
  request.mockResolvedValue(mockState.settings);

  capturePose.mockResolvedValueOnce({ completed: false, pose_number: 2, session_id: 'test-session-retake' });
  capturePose.mockResolvedValueOnce({ completed: true, pose_number: 4, session_id: 'test-session-retake', image_url: '/final.jpg' });

  await act(async () => {
    render(<Capture />);
  });
  await act(async () => { await Promise.resolve(); });

  const liveViewImg = screen.getByAltText('Live View');
  act(() => {
    fireEvent.load(liveViewImg);
  });

  // Chụp tấm đầu tiên trong retake (pose 2)
  const shutterBtn = screen.getByRole('button', { name: 'BẤM ĐỂ CHỤP' });
  act(() => {
    fireEvent.click(shutterBtn);
  });

  // Chạy qua countdown -> SMILE -> chụp
  act(() => {
    jest.advanceTimersByTime(1100);
  });
  act(() => {
    jest.advanceTimersByTime(900);
  });
  await act(async () => { await Promise.resolve(); });

  expect(capturePose).toHaveBeenCalledWith('test-session-retake', 'tpl-multi', 2, {
    isRetake: true,
    isLastInRetake: false
  });
});
