import fs from 'fs';
import { calendar, auth, calendar_v3 } from '@googleapis/calendar';
import { GaxiosResponse } from 'gaxios';
import { randomUUID } from 'crypto';

import prisma from './prisma';
import { BallroomType, Calendar, CalendarName, EventType } from '.prisma/client';

const CREDENTIALS_PATH: string = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

const credentialsData = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
const credentials = JSON.parse(credentialsData);

const client = new auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.readonly'],
});

interface ICalendar {
  calendar: calendar_v3.Calendar;
}

export type Event = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  startTime: string | Date;
  endTime: string | Date;
  recurrence: string[] | undefined;
  type: EventType;
  ballroomId: BallroomType;
  calendarId: CalendarName;
};

type ResponseBody = {
  syncToken: string;
  pageToken: string;
  events: Event[];
};

class CalendarAdapter implements ICalendar {
  calendar = calendar({ version: 'v3', auth: client });
  calendars: Calendar[] = [];

  async sync() {
    const calendars = await this.getCalendars();

    await Promise.all(
      calendars.map(async (calendar) => {
        const self = this;

        console.log(`Fetching ${calendar.name}`);

        const { syncToken, events } = await this.getCalendarPage(calendar);

        let watchId;
        if (process.env.DOMAIN && !calendar.watchId) {
          watchId = await this.watchEventsForCalendar(calendar);
        }

        await this.save(
          {
            id: calendar.id,
            syncToken,
            watchId: watchId || calendar.watchId,
          },
          events.filter(({ status }) => status === 'confirmed'),
        );

        console.log(`Succesfully get events for ${calendar.name}`);

        return;
      }),
    );
  }

  async save({ id, watchId, syncToken }: Partial<Calendar>, events: Event[]) {
    console.log('Saving new events...');

    const res = await prisma.calendar.update({
      where: {
        id,
      },
      data: {
        watchId,
        syncToken,
        events: {
          upsert: events
            .filter(({ status }) => status === 'confirmed')
            .map(({ id: eventId, ballroomId, calendarId, ...eventData }) => ({
              where: {
                id: eventId,
              },
              create: {
                id: eventId,
                ...eventData,
                ballroom: {
                  connect: {
                    id: ballroomId,
                  },
                },
              },
              update: {
                ...eventData,
                ballroom: {
                  connect: {
                    id: ballroomId,
                  },
                },
              },
            })),
          deleteMany: events
            .filter(({ status }) => status === 'cancelled')
            .map(({ id: eventId }) => ({
              id: eventId,
            })),
        },
      },
      include: {
        events: true,
      },
    });
  }

  getCalendars() {
    return prisma.calendar.findMany();
  }

  async getCalendarPage(calendar: Calendar, pageToken?: string, events: Event[] = []): Promise<ResponseBody> {
    const response = await this.getEventsForCalendar(calendar, pageToken);

    Object.assign(events, response.events);

    if (response.syncToken) {
      return { syncToken: response.syncToken, pageToken: '', events };
    }

    return this.getCalendarPage(calendar, response.pageToken, events);
  }

  async getEventsForCalendar(calendar: Calendar, pageToken?: string) {
    try {
      return this.calendar.events
        .list({
          calendarId: calendar.id,
          pageToken: pageToken || undefined,
          syncToken: calendar.syncToken || undefined,
        })
        .then((res) => this.transformResponse(res, calendar));
    } catch (e) {
      console.log(e);

      return {
        events: [],
        syncToken: '',
        pageToken: '',
      };
    }
  }

  async watchEventsForCalendar(calendar: Calendar) {
    const watchId = randomUUID();

    try {
      return this.calendar.events
        .watch({
          calendarId: calendar.id,
          requestBody: {
            id: watchId,
            type: 'webhook',
            address: `${process.env.DOMAIN}/webhook/events`,
          },
        })
        .then((res: GaxiosResponse<calendar_v3.Schema$Channel>) => {
          return res.data.id || '';
        });
    } catch (e) {
      console.log(e);

      return '';
    }
  }

  transformResponse(response: GaxiosResponse<calendar_v3.Schema$Events>, calendar: Calendar): ResponseBody {
    const { nextSyncToken, nextPageToken, items } = response.data;

    return {
      syncToken: nextSyncToken || '',
      pageToken: nextPageToken || '',
      events:
        items?.map(
          ({ id, status, summary, description, start, end, recurrence }): Event => ({
            id: id || '',
            status: status || '',
            title: summary || '',
            description: description || null,
            startTime: start?.dateTime || '',
            endTime: end?.dateTime || '',
            recurrence: recurrence || undefined,
            type: EventType[calendar.name === 'SCHEDULE' ? 'SCHEDULE' : 'RESERVATION'],
            ballroomId: BallroomType[calendar.name === 'SCHEDULE' ? 'VARIES' : calendar.name],
            calendarId: CalendarName[calendar.name],
          }),
        ) || [],
    };
  }
}

export default CalendarAdapter;
