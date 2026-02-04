import express, { Request, Response, NextFunction } from 'express';

const router = express.Router();

/* GET admins listing. */
router.get('/', async function(_req: Request, res: Response, _next: NextFunction) {
  res.status(200).send({ message: 'Admins endpoint' });
});

export default router;
