import express from 'express';
import { EventType } from '@prisma/client';

import CalendarAdapter from './modules/calendar';
import prisma from './modules/prisma';

const app = express();
const port = 3000;
const calendarClient = new CalendarAdapter();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/api/schedule', async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        type: EventType.SCHEDULE,
        startTime: req.body.dateFrom && {
          gte: new Date(req.body.dateFrom),
        },
        endTime: req.body.dateTo && {
          lte: new Date(req.body.dateTo),
        },
      },
    });

    res.status(200).send(events);
  } catch (e: any) {
    console.log(JSON.stringify(e, null, 2));
    res.status(e.code).send(JSON.stringify(e, null, 2));
  }
});

app.get('/api/reservations', async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        type: EventType.RESERVATION,
        startTime: {
          gte: new Date(req.body.dateFrom),
        },
        endTime: {
          lte: new Date(req.body.dateTo),
        },
      },
    });

    res.status(200).send(events);
  } catch (e: any) {
    console.log(JSON.stringify(e, null, 2));
    res.status(e.code).send(JSON.stringify(e, null, 2));
  }
});

app.post('/webhook/event', async (req, res) => {
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
      const { syncToken, events } = await calendarClient.getEventsForCalendar(calendar);
      console.log(events);
      await calendarClient.save({ id: calendar.id, watchId, syncToken }, events);
    }

    res.sendStatus(200);
  } catch (e: any) {
    res.sendStatus(500);
  }
});

app.listen(port, async () => {
  console.log(`Example app listening at http://localhost:${port}`);

  try {
    await calendarClient.sync();
    console.log('Successfully fetched events from Google Calendar');
  } catch (e) {
    console.log(JSON.stringify(e, null, 2));
  }
});
