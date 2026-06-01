/**
 * /app/tasks is retired. Tasks now live inside their project workspace's
 * Tasks tab, and the personal "what's next" view is /app/my-work.
 */
import { redirect } from 'next/navigation';

export default function TasksRedirect() {
  redirect('/app/my-work');
}
