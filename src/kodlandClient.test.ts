import { describe, expect, it, vi } from 'vitest';
import { fetchKodlandPendingReviews, fetchKodlandSnapshot, getUserIdFromAccessToken, loginKodland } from './kodlandClient';

function token(payload: Record<string, unknown>) {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('kodland authenticated client', () => {
  it('reads the teacher id from an access token', () => {
    expect(getUserIdFromAccessToken(token({ user_id: 3047385 }))).toBe('3047385');
  });

  it('sends credentials as form data without persisting tokens', async () => {
    const fetcher = vi.fn(() => jsonResponse({ access_token: token({ user_id: 1 }), refresh_token: 'refresh' }));
    await expect(loginKodland({ username: ' teacher ', password: 'secret' }, fetcher as typeof fetch)).resolves.toMatchObject({
      refresh_token: 'refresh',
    });
    expect(fetcher).toHaveBeenCalledWith('https://sso.production.kodland.org/login', expect.objectContaining({
      method: 'POST',
      body: 'username=teacher&password=secret',
    }));
  });

  it('fetches all group pages, active group students, and safe student details from the v2 api', async () => {
    const accessToken = token({ user_id: 7 });
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith('/login')) return jsonResponse({ access_token: accessToken });
      if (url.includes('page=1')) return jsonResponse({ next: 'page-2', results: [{ id: 10, title: 'Turma A', students_count: 1 }] });
      if (url.includes('page=2')) return jsonResponse({ next: null, results: [{ id: 11, title: 'Turma B', is_archive: true }] });
      if (url.includes('student_groups/10/get_students_main_data/')) {
        return jsonResponse([{ main_info: { student_id: 50, full_name: 'Aluno Teste', status: 'active' }, progress_info: [] }]);
      }
      if (url.includes('student_groups/10/lessons/')) {
        return jsonResponse([
          { lesson_id: 200, lesson_number: 8, lesson_title: 'Loops', lesson_passed: true },
          { lesson_id: 201, lesson_number: 9, lesson_title: 'Condicionais', lesson_passed: false },
        ]);
      }
      if (url.includes('student_groups/10/lesson/200/get_group_progress/')) {
        return jsonResponse({
          lesson_tasks: [{ id: 1, number: 1, title: 'Projeto', lesson_id: 200, link_to_service: 'https://bo.kodland.test/review/1' }],
          students_progress: [{
            student_id: 50,
            student_name: 'Aluno Teste',
            tasks_data: [{ task_id: 1, task_status_key: 'TASK_SUBMITTED', task_status_value: 'Enviada' }],
          }],
        });
      }
      if (url.includes('students/50/get_general_info_for_student_backoffice_page/')) {
        return jsonResponse({ main_info: { phone_number: '11999999999', profile_url: 'https://bo.kodland.test/students/50', password: 'secret' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    await expect(fetchKodlandSnapshot({ username: 'teacher', password: 'secret' }, fetcher as typeof fetch)).resolves.toMatchObject({
      teacherId: '7',
      groups: [{ externalId: '10' }, { externalId: '11' }],
      students: [{ externalId: '50', externalClassId: '10', phone: '11999999999', profileUrl: 'https://bo.kodland.test/students/50' }],
      pendingReviews: [{ externalStudentId: '50', taskTitle: 'Projeto', correctionUrl: 'https://bo.kodland.test/review/1' }],
    });
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('student_groups/11/'), expect.anything());
    expect(fetcher).toHaveBeenCalledWith('https://backoffice.kodland.org/api/v2/students/50/get_general_info_for_student_backoffice_page/', expect.anything());
    expect(fetcher).toHaveBeenCalledWith('https://backoffice.kodland.org/api/v2/student_groups/10/lessons/', expect.anything());
    expect(fetcher).toHaveBeenCalledWith('https://backoffice.kodland.org/api/v2/student_groups/10/lesson/200/get_group_progress/', expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith('https://backoffice.kodland.org/api/v2/student_groups/10/lesson/201/get_group_progress/', expect.anything());
  });

  it('returns a useful message for invalid credentials', async () => {
    const fetcher = vi.fn(() => jsonResponse({}, 401));
    await expect(loginKodland({ username: 'teacher', password: 'wrong' }, fetcher as typeof fetch)).rejects.toThrow('Usuario ou senha invalidos.');
  });

  it('updates pending reviews without fetching teacher pages or student details', async () => {
    const accessToken = token({ user_id: 7 });
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith('/login')) return jsonResponse({ access_token: accessToken });
      if (url.includes('student_groups/10/get_students_main_data/')) {
        return jsonResponse([{ main_info: { student_id: 50, full_name: 'Aluno Teste', status: 'active' }, progress_info: [] }]);
      }
      if (url.includes('student_groups/10/lessons/')) {
        return jsonResponse([
          { lesson_id: 200, lesson_number: 8, lesson_title: 'Loops', lesson_passed: true },
          { lesson_id: 201, lesson_number: 9, lesson_title: 'Futura', lesson_passed: false },
        ]);
      }
      if (url.includes('student_groups/10/lesson/200/get_group_progress/')) {
        return jsonResponse({
          lesson_tasks: [{ id: 1, number: 1, title: 'Projeto', lesson_id: 200 }],
          students_progress: [{
            student_id: 50,
            student_name: 'Aluno Teste',
            tasks_data: [{ task_id: 1, task_status_key: 'TASK_SUBMITTED_LATE' }],
          }],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(fetchKodlandPendingReviews(
      { username: 'teacher', password: 'secret' },
      [{ externalId: '10', title: 'Turma A', archived: false }, { externalId: '11', title: 'Turma B', archived: true }],
      fetcher as typeof fetch,
    )).resolves.toMatchObject([{ externalClassId: '10', externalStudentId: '50', taskTitle: 'Projeto', statusLabel: 'Entregue com atraso' }]);

    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('get_teachers_groups'), expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('get_general_info_for_student_backoffice_page'), expect.anything());
    expect(fetcher).toHaveBeenCalledWith('https://backoffice.kodland.org/api/v2/student_groups/10/lesson/200/get_group_progress/', expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith('https://backoffice.kodland.org/api/v2/student_groups/10/lesson/201/get_group_progress/', expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('student_groups/11/'), expect.anything());
  });

  it('renews an expired access token once during synchronization', async () => {
    const expired = token({ user_id: 7 });
    const renewed = token({ user_id: 7, renewed: true });
    let groupAttempts = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith('/login')) return jsonResponse({ access_token: expired, refresh_token: 'refresh' });
      if (url.endsWith('/token')) return jsonResponse({ access_token: renewed });
      if (url.includes('get_teachers_groups')) {
        groupAttempts += 1;
        return groupAttempts === 1 ? jsonResponse({}, 401) : jsonResponse({ next: null, results: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    await expect(fetchKodlandSnapshot({ username: 'teacher', password: 'secret' }, fetcher as typeof fetch)).resolves.toMatchObject({
      teacherId: '7',
      groups: [],
    });
    expect(fetcher).toHaveBeenCalledWith('https://sso.production.kodland.org/token', expect.objectContaining({
      method: 'POST',
      body: 'grant_type=refresh_token&refresh_token=refresh',
    }));
  });
});
