import Calendar from './modules/calendar';
import prisma from './modules/prisma';

async function main() {
  const events = await prisma.event.findMany({
    where: {
      calendarId: 'MEDIUM',
    },
    include: {
      calendar: true,
      ballroom: true,
    },
  });

  console.log(JSON.stringify(events, null, 2));
}

main().catch((e) => {
  console.log('Error: ', JSON.stringify(e, null, 2));
});
