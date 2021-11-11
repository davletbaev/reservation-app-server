import { Calendar } from '.prisma/client';
import { GaxiosResponse } from 'gaxios';
import { calendar_v3 } from '@googleapis/calendar';

import CalendarAdapter, { Event, ICalendar } from './calendar';
import { MockContext, Context, createMockContext } from '../prisma/context';

import calendars from '../../testData/calendars.json';
import eventsData from '../../testData/events.json';
import response from '../../testData/response.json';
import watch from '../../testData/watch.json';

const eventsListEndpoint = jest.fn().mockResolvedValue(response);
const eventsWatchEndpoint = jest.fn().mockResolvedValue(watch);

jest.mock('@googleapis/calendar', () => {
  return {
    auth: {
      JWT: jest.fn().mockImplementation(() => {
        return {};
      }),
    },
    calendar: () => ({
      events: {
        list: () => eventsListEndpoint(),
        watch: () => eventsWatchEndpoint(),
      },
    }),
  };
});

describe('CalendarAdapter', () => {
  let calendarClient: ICalendar;
  let mockCtx: MockContext;
  let ctx: Context;

  beforeEach(() => {
    mockCtx = createMockContext() as unknown as MockContext;
    ctx = mockCtx as unknown as Context;
    calendarClient = new CalendarAdapter(ctx.prisma);
  });

  it('should get calendars from database when getCalendars method called', async () => {
    mockCtx.prisma.calendar.findMany.mockResolvedValue(calendars as Calendar[]);

    await expect(calendarClient.getCalendars()).resolves.toEqual(calendars);
  });

  it('should fetch events for calendar when getEventsForCalendar method called', async () => {
    const [testCalendar] = calendars as Calendar[];

    await expect(calendarClient.getEventsForCalendar(testCalendar)).resolves.toEqual(response);
    expect(eventsListEndpoint).toHaveBeenCalled();
  });

  it('should transform response for api when transformResponse method called', () => {
    const [testCalendar] = calendars as Calendar[];

    expect(
      calendarClient.transformResponse(response as GaxiosResponse<calendar_v3.Schema$Events>, testCalendar),
    ).toEqual(eventsData);
  });

  it('should call getEventsForCalendar and transformResponse when getCalendarPages called', async () => {
    const [testCalendar] = calendars as Calendar[];

    const getEventsForCalendarMock = jest.fn().mockResolvedValue(response);
    const transformResponseMock = jest
      .fn()
      .mockResolvedValueOnce({
        ...eventsData,
        syncToken: '',
      })
      .mockResolvedValue({
        ...eventsData,
        syncToken: 'testtoken',
      });

    calendarClient.getEventsForCalendar = getEventsForCalendarMock;
    calendarClient.transformResponse = transformResponseMock;

    await calendarClient.getCalendarPages(testCalendar, 'testtoken');

    expect(getEventsForCalendarMock).toHaveBeenCalledTimes(2);
    expect(transformResponseMock).toHaveBeenCalled();
  });

  it('should save events to database when save method is called', async () => {
    const [testCalendar] = calendars as Calendar[];

    mockCtx.prisma.calendar.update.mockResolvedValue(testCalendar);

    await expect(calendarClient.save(testCalendar, eventsData.events as Event[])).resolves.toEqual(testCalendar);
  });

  it('should save syncToken when sync method called', async () => {
    const [testCalendar] = calendars as Calendar[];

    const getCalendarsMock = jest.fn().mockResolvedValue([testCalendar]);
    const getCalendarPagesMock = jest.fn().mockResolvedValue(eventsData);
    const saveMock = jest.fn().mockResolvedValue({});

    const testResult = {
      id: testCalendar.id,
      syncToken: eventsData.syncToken,
      watchId: testCalendar.watchId,
    };

    calendarClient.getCalendars = getCalendarsMock;
    calendarClient.getCalendarPages = getCalendarPagesMock;
    calendarClient.save = saveMock;

    await calendarClient.sync();

    expect(getCalendarsMock).toHaveBeenCalled();
    expect(getCalendarPagesMock).toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith(testResult, eventsData.events);
  });

  it('should call watchEventsForCalendar if no watchId stored for calendar', async () => {
    const [testCalendar] = calendars as Calendar[];

    testCalendar.watchId = '';

    const testResult = {
      id: testCalendar.id,
      syncToken: eventsData.syncToken,
      watchId: 'testtest',
    };

    const getCalendarsMock = jest.fn().mockResolvedValue([testCalendar]);
    const getCalendarPagesMock = jest.fn().mockResolvedValue(eventsData);
    const watchEventsForCalendarMock = jest.fn().mockResolvedValue(testResult.watchId);
    const saveMock = jest.fn().mockResolvedValue({});

    calendarClient.getCalendars = getCalendarsMock;
    calendarClient.getCalendarPages = getCalendarPagesMock;
    calendarClient.watchEventsForCalendar = watchEventsForCalendarMock;
    calendarClient.save = saveMock;

    await calendarClient.sync();

    expect(watchEventsForCalendarMock).toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith(testResult, eventsData.events);
  });

  it('should return watchId when watchEventsForCalendar method called', async () => {
    const [testCalendar] = calendars as Calendar[];

    jest.mock('crypto', () => {
      return {
        randomUUID: jest.fn().mockReturnValue(watch.data.id),
      };
    });

    await expect(calendarClient.watchEventsForCalendar(testCalendar)).resolves.toEqual(watch.data.id);
    expect(eventsWatchEndpoint).toHaveBeenCalled();
  });
});
