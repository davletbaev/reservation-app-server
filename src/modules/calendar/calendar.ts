import { calendar, auth, calendar_v3 } from '@googleapis/calendar';
import { GaxiosResponse } from 'gaxios';
import { randomUUID } from 'crypto';

import { BallroomType, Calendar, CalendarName, EventType, PrismaClient } from '.prisma/client';

import credentials from '../../credentials/key.json';

const client = new auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.readonly'],
});

export interface ICalendar {
  prisma: PrismaClient;
  calendar: calendar_v3.Calendar;
  sync(): void;
  save(calendar: Partial<Calendar>, events: Event[]): Promise<Calendar>;
  getCalendars(): Promise<Calendar[]>;
  getCalendarPages(calendar: Calendar, pageToken?: string, events?: Event[]): Promise<ResponseBody>;
  getEventsForCalendar(calendar: Calendar, pageToken?: string): Promise<GaxiosResponse<calendar_v3.Schema$Channel>>;
  watchEventsForCalendar(calendar: Calendar): Promise<string>;
  transformResponse(response: GaxiosResponse<calendar_v3.Schema$Events>, calendar: Calendar): ResponseBody;
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
  prisma: PrismaClient;
  calendar = calendar({ version: 'v3', auth: client });
  calendars: Calendar[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async sync() {
    const calendars = await this.getCalendars();

    await Promise.all(
      calendars.map(async (calendar) => {
        console.log(`Fetching ${calendar.name}`);

        const { syncToken, events } = await this.getCalendarPages(calendar);

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

  async save({ id, watchId, syncToken }: Partial<Calendar>, events: Event[]): Promise<Calendar> {
    console.log('Saving new events...');

    return this.prisma.calendar.update({
      where: {
        id,
      },
      data: {
        watchId,
        syncToken,
        events: {
          upsert: events
            .filter(({ status }) => status === 'confirmed')
            .map(({ id: eventId, status, calendarId, ballroomId, ...eventData }) => ({
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
    });
  }

  getCalendars() {
    return this.prisma.calendar.findMany();
  }

  async getCalendarPages(calendar: Calendar, pageToken?: string, events: Event[] = []): Promise<ResponseBody> {
    const response = await this.getEventsForCalendar(calendar, pageToken);
    const transformedResponse = await this.transformResponse(response, calendar);

    Object.assign(events, transformedResponse.events);

    if (transformedResponse.syncToken) {
      return { syncToken: transformedResponse.syncToken, pageToken: '', events };
    }

    return this.getCalendarPages(calendar, transformedResponse.pageToken, events);
  }

  async getEventsForCalendar(
    calendar: Calendar,
    pageToken?: string,
  ): Promise<GaxiosResponse<calendar_v3.Schema$Channel>> {
    return this.calendar.events.list({
      calendarId: calendar.id,
      pageToken: pageToken || undefined,
      syncToken: calendar.syncToken || undefined,
    });
  }

  async watchEventsForCalendar(calendar: Calendar): Promise<string> {
    const watchId = randomUUID();

    return this.calendar.events
      .watch({
        calendarId: calendar.id,
        requestBody: {
          id: watchId,
          type: 'webhook',
          address: `${process.env.DOMAIN}webhook/events`,
        },
      })
      .then((res: GaxiosResponse<calendar_v3.Schema$Channel>) => {
        return res?.data?.id || '';
      });
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
