import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Review from './Review';
import Download from './Download';
import { printSession, request } from '../services/kioskApi';

const mockNavigate = jest.fn();
let mockState;
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockState })
}));
jest.mock('../services/kioskApi', () => ({ printSession: jest.fn(), request: jest.fn() }));
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

test('retake carries the original template when enabled', () => {
  const view = render(<Review />);
  fireEvent.click(screen.getByRole('button', { name: 'Chụp Lại' }));
  expect(mockNavigate).toHaveBeenCalledWith('/capture', expect.objectContaining({
    state: expect.objectContaining({ templateId: 'tpl-a', retakeCount: 1 })
  }));
  view.unmount();
  mockState.settings.enable_retake = false;
  render(<Review />);
  expect(screen.queryByRole('button', { name: 'Chụp Lại' })).toBeNull();
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

test('offline ending screen does not render a QR code', () => {
  mockState.settings = { offline_mode: true };
  render(<Download />);
  expect(screen.queryByText('QR')).toBeNull();
});
