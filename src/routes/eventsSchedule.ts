import { EventType, PrismaClient } from '.prisma/client';
import { Request, Response } from 'express';

const eventsSchedule = (prisma: PrismaClient) => async (req: Request, res: Response) => {
  console.log(prisma);

  try {
    const events = await prisma.event.findMany({
      where: {
        type: EventType.SCHEDULE,
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
    console.log(JSON.stringify(e, null, 2));
    res.status(500).json(e);
  }
};

export default eventsSchedule;
