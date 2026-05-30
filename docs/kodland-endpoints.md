# Kodland Backoffice Endpoint Map

Last static review: 2026-05-30

This map was extracted from the public JavaScript bundles loaded by
`https://bo.kodland.org/`. It does not contain credentials, tokens, or private
responses. Kodland may change these internal endpoints without notice.

## API Bases

| Client | Base URL | Purpose |
| --- | --- | --- |
| SSO | `https://sso.production.kodland.org/` | Login, token refresh, permissions |
| Backoffice v1 | `https://backoffice.kodland.org/api/v1/` | Current teacher, group, student, and schedule screens |
| Backoffice v2 | `https://backoffice.kodland.org/api/v2/` | Some newer backoffice operations |

The browser sends `Authorization: Bearer <access_token>`. The access and refresh
tokens must never be logged or persisted in the AulaPay SQLite database.

## Authentication

| Method | Path | Body | Use |
| --- | --- | --- | --- |
| `POST` | `login` | Form: `username`, `password` | Obtain `access_token` and `refresh_token` |
| `POST` | `token` | Form: `grant_type=refresh_token`, `refresh_token` | Renew the access token |
| `GET` | `user_groups/my/` | - | Load permissions from SSO |

## Read-Only Sync Flow

These are the endpoints needed by AulaPay. They are read-only and should be the
first integration scope.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `teachers/{teacherId}/get_general_info_for_teacher_backoffice_page` | Teacher identity and metadata |
| `GET` | `teachers/{teacherId}/get_teachers_groups/?page={page}&page_size={size}` | Teacher groups |
| `GET` | `student_groups/{groupId}/get_general_info_for_group_backoffice_page` | Group title, teacher, course, timezone, and counters |
| `GET` | `student_groups/{groupId}/get_students_main_data` | Students linked to the group and progress summary |
| `GET` | `student_groups/{groupId}/schedule_view/` | Group lesson schedule |
| `GET` | `student_groups/{groupId}/lessons/` | Group lessons |
| `GET` | `students/{studentId}/get_general_info_for_student_backoffice_page/` | Full student details |
| `GET` | `students/{studentId}/backoffice_groups/` | Groups linked to one student |

Examples visible in the supplied screenshots:

```text
teachers/3047385/get_teachers_groups/?page=1&page_size=10
student_groups/61918/get_general_info_for_group_backoffice_page
student_groups/61918/get_students_main_data
student_groups/61918/schedule_view/
```

Recommended synchronization sequence:

1. Authenticate with SSO.
2. Read the user ID from the access token payload.
3. Fetch the teacher groups with `teachers/{teacherId}/get_teachers_groups/`.
4. For each group, fetch general info, students, and schedule.
5. Fetch individual student detail only when the local record needs richer
   contact information.
6. Import into AulaPay in one SQLite transaction and retain the last successful
   local snapshot if the remote sync fails.

## Supporting Read Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `students/?page={page}&page_size={size}` | Paginated student list |
| `GET` | `students/get_data_for_filters/` | Student list filters |
| `GET` | `students/get_data_for_edit_form_filters/` | Student edit filters |
| `GET` | `student_groups/?page={page}&page_size={size}` | Paginated group list |
| `GET` | `student_groups/get_data_for_filters/` | Group list filters |
| `GET` | `student_groups/all_group_titles/` | Group title options |
| `GET` | `student_groups/available_groups/` | Available groups |
| `GET` | `student_groups/{groupId}/schedule_view/` | Group schedule |
| `GET` | `zoom_records/?timetable_id={id}&group_id={groupId}` | Lesson recording metadata |
| `GET` | `group_comments/?group={groupId}` | Group comments |
| `GET` | `special_group_lessons/?group={groupId}` | Special lessons |
| `GET` | `special_group_lessons/{lessonId}/attendance/` | Attendance for a special lesson |
| `GET` | `teacher_timetables/{teacherId}` | Teacher availability |
| `GET` | `teachers/{teacherId}/get_teacher_timetable` | Initializes teacher availability when absent |
| `GET` | `teachers/{teacherId}/get_teachers_courses` | Teacher courses |
| `GET` | `courses?has_groups_for_teacher={teacherId}` | Courses with groups for a teacher |
| `GET` | `groups/types` | Group types |
| `GET` | `utils/get_timezones_with_offsets/` | Timezone choices |
| `GET` | `students/{studentId}/get_all_courses/` | Student course history |
| `GET` | `student_transfers/?student={studentId}` | Student transfer history |

## Administrative Endpoints Excluded From Sync

The portal also exposes mutation endpoints. AulaPay sync must not call them.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `students/` | Create student |
| `PATCH` | `students/{studentId}/edit/` | Edit student |
| `DELETE` | `students/{studentId}/` | Delete student |
| `POST` | `students/{studentId}/change_group/` | Enroll or transfer student |
| `POST` | `students/{studentId}/churn_from_group/` | Remove student from group |
| `POST` | `students/{studentId}/activate_pause_in_learning/` | Pause student |
| `POST` | `students/{studentId}/deactivate_pause_in_learning/` | End pause |
| `POST` | `student_groups/` | Create group |
| `PATCH` | `student_groups/{groupId}/` | Edit group |
| `PATCH` | `timetables/{timetableId}/change_teacher/` | Replace lesson teacher |
| `PATCH` | `timetables/{timetableId}/change_time/` | Change lesson time |
| `PATCH` | `timetables/{timetableId}/reschedule/` | Reschedule lessons |
| `POST` | `group/{groupId}/create_schedule/` | Create schedule |
| `POST` | `group_comments/` | Create group comment |
| `PATCH` | `group_comments/{commentId}/` | Edit group comment |
| `DELETE` | `group_comments/{commentId}/` | Delete group comment |

## Runtime Validation Still Needed

Unauthenticated requests to the example endpoints returned `404` on 2026-05-30.
This is consistent with an API that hides protected routes from anonymous
clients, but it does not validate response shapes.

Before enabling production sync:

1. Log in through the AulaPay credential form or a local browser session.
2. Call only the read-only sync flow endpoints.
3. Validate response shapes without logging credentials, tokens, phone numbers,
   emails, or full API payloads.
4. Add parser fixtures with redacted sample responses.

