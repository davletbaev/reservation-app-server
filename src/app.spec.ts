import express from 'express';
import request from 'supertest';
import { Calendar, Event } from '.prisma/client';

import { eventsSchedule, eventsReservations, webhookEvents, routes } from './routes';

import calendars from './testData/calendars.json';
import watchData from './testData/watch.json';
import eventData from './testData/events.json';
import { Context, createMockContext, MockContext } from './modules/prisma/context';
import { mockReset } from 'jest-mock-extended';
import CalendarAdapter, { ICalendar } from './modules/calendar/calendar';

const app = express();

describe('GET /events/schedule', () => {
  let mockCtx: MockContext;
  let ctx: Context;

  beforeAll(() => {
    mockCtx = createMockContext() as unknown as MockContext;
    ctx = mockCtx as unknown as Context;

    app.get(routes.eventsSchedule, eventsSchedule(ctx.prisma));
  });

  beforeEach(() => {
    mockReset(mockCtx.prisma);
  });

  it('responds with array of events of type SCHEDULE', async () => {
    const prismaEvents = eventData.events.map((event) => ({
      ...event,
      startTime: event.startTime as unknown as Date,
      endTime: event.endTime as unknown as Date,
    }));

    mockCtx.prisma.event.findMany.mockResolvedValue(prismaEvents as Event[]);

    await request(app)
      .get(routes.eventsSchedule)
      .expect(200)
      .expect('Content-Type', /json/)
      .then((response) => {
        expect(JSON.parse(response.text)).toEqual(prismaEvents);
      });
  });
});

describe('GET /events/reservations', () => {
  let mockCtx: MockContext;
  let ctx: Context;

  beforeAll(() => {
    mockCtx = createMockContext() as unknown as MockContext;
    ctx = mockCtx as unknown as Context;

    app.get(routes.eventsReservations, eventsReservations(ctx.prisma));
  });

  beforeEach(() => {
    mockReset(mockCtx.prisma);
  });

  it('responds with array of events of type RESERVATION', async () => {
    const prismaEvents = eventData.events.map((event) => ({
      ...event,
      startTime: event.startTime as unknown as Date,
      endTime: event.endTime as unknown as Date,
    }));

    mockCtx.prisma.event.findMany.mockResolvedValue(prismaEvents as Event[]);

    await request(app)
      .get(routes.eventsReservations)
      .expect(200)
      .expect('Content-Type', /json/)
      .then((response) => {
        expect(JSON.parse(response.text)).toEqual(prismaEvents);
      });
  });
});

describe('POST /webhook/events', () => {
  let mockCtx: MockContext;
  let ctx: Context;
  let calendarClient: ICalendar;

  beforeAll(() => {
    mockCtx = createMockContext() as unknown as MockContext;
    ctx = mockCtx as unknown as Context;

    calendarClient = new CalendarAdapter(ctx.prisma);

    calendarClient.getEventsForCalendar = jest.fn();
    calendarClient.save = jest.fn();
    calendarClient.transformResponse = jest.fn();

    app.post(routes.webhookEvents, webhookEvents(calendarClient, ctx.prisma));
  });

  beforeEach(() => {
    mockReset(mockCtx.prisma);
  });

  it('should request new events when webhook called with "exists" status', async () => {
    const testWatchId = 'test-watch-id';

    mockCtx.prisma.calendar.findFirst.mockResolvedValue(calendars[0] as Calendar);

    (calendarClient.transformResponse as jest.Mock).mockResolvedValue({ events: [], syncToken: '' });
    (calendarClient.save as jest.Mock).mockResolvedValue({});

    await request(app)
      .post(routes.webhookEvents)
      .send(watchData.data)
      .set('X-Goog-Channel-ID', testWatchId)
      .set('X-Goog-Resource-State', 'exists')
      .expect(200)
      .then(() => {
        expect(mockCtx.prisma.calendar.findFirst).toHaveBeenCalledWith({ where: { watchId: testWatchId } });
        expect(calendarClient.getEventsForCalendar).toHaveBeenCalled();
        expect(calendarClient.transformResponse).toHaveBeenCalled();
        expect(calendarClient.save).toHaveBeenCalled();
      });
  });

  it('should send status 200 when webhook called with any other status', async () => {
    mockCtx.prisma.calendar.findFirst.mockResolvedValue(calendars[0] as Calendar);

    await request(app)
      .post(routes.webhookEvents)
      .send(watchData.data)
      .set('X-Goog-Channel-ID', 'test')
      .set('X-Goog-Resource-State', 'sync')
      .expect(200)
      .then(() => {
        expect(mockCtx.prisma.calendar.findFirst).not.toHaveBeenCalled();
      });
  });
});
