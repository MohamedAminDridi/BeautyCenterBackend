const cron = require('node-cron'); // Install with: npm install node-cron
const axios = require('axios'); // Install with: npm install axios

class NotificationScheduler {
  constructor() {
    this.scheduledJobs = new Map();
  }

  // Schedule a notification for a reservation
  scheduleNotification(reservation) {
    const now = new Date('2025-07-14T02:05:00+02:00'); // Current date and time in CET
    const reservationDate = new Date(reservation.date);
    const timeDiffMinutes = (reservationDate - now) / (1000 * 60);

    if (timeDiffMinutes > 0 && timeDiffMinutes <= 30) { // Notify 30 minutes before
      const jobId = `notification_${reservation._id}`;
      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId).stop();
      }

      const task = cron.schedule(`*/${Math.max(1, Math.floor(timeDiffMinutes))} * * * *`, () => {
        this.sendNotification(reservation);
      }, {
        scheduled: true,
        timezone: 'Europe/Paris', // Adjust to your time zone
      });

      this.scheduledJobs.set(jobId, task);
      console.log(`Scheduled notification for reservation ${reservation._id} at ${reservationDate}`);
    }
  }

  // Send notification (placeholder - implement based on your system)
  async sendNotification(reservation) {
    try {
      // Example: Send push notification via Firebase or email via Nodemailer
      console.log(`Sending notification for reservation ${reservation._id}:`, {
        message: `Upcoming appointment with ${reservation.client?.firstName} ${reservation.client?.lastName} at ${reservation.date}`,
      });

      // Uncomment and configure based on your notification service
      // await axios.post('https://your-notification-service.com/send', {
      //   to: reservation.client?.email,
      //   message: `Upcoming appointment with ${reservation.client?.firstName} at ${reservation.date}`,
      // });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  // Cancel a scheduled notification
  cancelNotification(reservationId) {
    const jobId = `notification_${reservationId}`;
    if (this.scheduledJobs.has(jobId)) {
      this.scheduledJobs.get(jobId).stop();
      this.scheduledJobs.delete(jobId);
      console.log(`Cancelled notification for reservation ${reservationId}`);
    }
  }

  // Schedule notifications for all active reservations
  async scheduleAllNotifications() {
    const activeReservations = await Reservation.find({
      status: { $in: ['pending', 'confirmed'] },
      date: { $gte: new Date('2025-07-14T02:05:00+02:00') },
    }).populate('client');

    activeReservations.forEach(reservation => {
      this.scheduleNotification(reservation);
    });
  }
}

module.exports = new NotificationScheduler();