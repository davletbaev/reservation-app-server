import { EventType, PrismaClient } from '.prisma/client';
import { Request, Response } from 'express';

const eventsReservations = (prisma: PrismaClient) => async (req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        type: EventType.RESERVATION,
        startTime: req.body?.dateFrom && {
          gte: new Date(req.body.dateFrom),
        },
        endTime: req.body?.dateTo && {
          lte: new Date(req.body.dateTo),
        },
      },
    });

    res.status(200).json(events);
  } catch (e: any) {
    console.log(e);
    res.status(500).json(e);
  }
};

export default eventsReservations;
