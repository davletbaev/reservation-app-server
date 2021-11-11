import express from 'express';

import CalendarAdapter from './modules/calendar';
import { eventsSchedule, eventsReservations, webhookEvents, routes } from './routes';
import prisma from './modules/prisma';

const app = express();
const port = 3000;
const calendarClient = new CalendarAdapter(prisma);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Get events of type SCHEDULE
app.get(routes.eventsSchedule, eventsSchedule(prisma));

// Get events of type RESERVATION
app.get(routes.eventsReservations, eventsReservations(prisma));

// Handle notifications about changes in Google Calendar
app.post(routes.webhookEvents, webhookEvents(calendarClient, prisma));

app.listen(port, async () => {
  console.log(`Example app listening at http://localhost:${port}`);

  try {
    await calendarClient.sync();
    console.log('Successfully fetched events from Google Calendar');
  } catch (e) {
    console.log(JSON.stringify(e, null, 2));
  }
});

export default app;
