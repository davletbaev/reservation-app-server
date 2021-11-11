import { Request, Response } from 'express';
import { ICalendar } from '../modules/calendar/calendar';

import { PrismaClient } from '.prisma/client';

const webhookEvents = (calendarClient: ICalendar, prisma: PrismaClient) => async (req: Request, res: Response) => {
  const watchId = req.get('X-Goog-Channel-ID');
  const status = req.get('X-Goog-Resource-State');

  if (status !== 'exists') return res.sendStatus(200);

  try {
    const calendar = await prisma.calendar.findFirst({
      where: {
        watchId,
      },
    });

    if (calendar) {
      console.log('Received notification message for ', calendar.name);
      const response = await calendarClient.getEventsForCalendar(calendar);
      const { events, syncToken } = await calendarClient.transformResponse(response, calendar);

      await calendarClient.save({ id: calendar.id, watchId, syncToken }, events);
    }

    res.sendStatus(200);
  } catch (e: any) {
    res.sendStatus(500);
  }
};

export default webhookEvents;
