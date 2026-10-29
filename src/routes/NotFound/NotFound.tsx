import { motion } from 'framer-motion';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { ButtonLink } from '../../components/Button/Button';
import { Emblem } from '../../components/Logo/Logo';
import './NotFound.css';

export default function NotFound() {
  return (
    <PageTransition bare label="Page not found">
      <div className="container not-found">
        <motion.span className="not-found__mark" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 0.8, y: 0 }} transition={{ duration: 0.5 }} aria-hidden="true">
          <Emblem size={72} />
        </motion.span>
        <h1>This path doesn't lead anywhere yet</h1>
        <p>The page you followed doesn't exist.</p>
        <ButtonLink to="/">Back to Afriversity</ButtonLink>
      </div>
    </PageTransition>
  );
}
