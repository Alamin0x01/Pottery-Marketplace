import { Container } from '../components/layout/Layout.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState } from '../components/ui/States.jsx';

export function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState icon="search" title="Page not found" description="The page you are looking for does not exist or has moved." action={<ButtonLink to="/">Back to home</ButtonLink>} />
    </Container>
  );
}
