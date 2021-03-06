const q = require('daskeyboard-applet');
const logger = q.logger;

const queryUrlBase = 'https://graph.microsoft.com/v1.0/me/mailfolders/inbox/messages';

function getTimestamp() {
  return Math.round(new Date().getTime() / 1000);
}

class OutlookAlerts extends q.DesktopApp {
  constructor() {
    super();
    this.pollingInterval = 60000;
    this.timestamp = getTimestamp();
  }

  /**
   * For a given message, find the sender
   * @param {*} message 
   */
  inspectSender(message) {
    for (let header of message.payload.headers) {
      if (header.name == 'From') {
        return header.value;
      }
    }
  }

  async checkMessages() {
    const timestamp = this.timestamp;
    this.timestamp = getTimestamp();
    logger.info(`Checking for monitored messages since ${timestamp}`);

    const monitors = this.config.monitors;

    if (!this.authorization.apiKey) {
      throw new Error("No apiKey available.");
    }

    const proxyRequest = new q.Oauth2ProxyRequest({
      apiKey: this.authorization.apiKey,
      uri: queryUrlBase,
      qs: {
        select:"Subject,Sender"
      }
    });

    return this.oauth2ProxyRequest(proxyRequest);
  }

  async retrieveMessage(id) {
    const proxyRequest = new q.Oauth2ProxyRequest({
      apiKey: this.authorization.apiKey,
      uri: `${queryUrlBase}/${id}`,
      qs: {
        fields: `payload/headers`,
      }
    });

    return this.oauth2ProxyRequest(proxyRequest);
  }

  async generateSignalMessage(json) {
    const senders = [];
    for (let message of json.messages) {
      const detail = await this.retrieveMessage(message.id);
      const sender = this.inspectSender(detail).replace(/\s*?<.*/, '');
      if (!senders.includes(sender)) {
        senders.push(sender);
      };
    }

    const lines = [];
    for (let sender of senders.sort()) {
      lines.push(`<div>New message from ${sender}</div>`);
    }
    return lines.join('\n');
  }

  async run() {
    return this.checkMessages().then((json) => {
      if (json.messages && json.messages.length > 0) {
        logger.info("Got " + json.messages.length + " messages.");

        let account = this.config.account;
        if (!account || account.length === 0) {
          account = 'Outlook account'
        }

        return this.generateSignalMessage(json).then(message => {
          return new q.Signal({
            points: [
              [new q.Point("#0000FF",q.Effects.BLINK)]
            ],
            name: `${account}`,
            message: message,
            link: {
              url: 'https://outlook.live.com/owa/',
              label: 'Check in Outlook',
            }
          });
        });
      } else {
        return null;
      }
    }).catch((error) => {
      logger.error("Error while getting mail: " + error);
      throw new Error("Error retrieving email.");
    });
  }
}

const applet = new OutlookAlerts();

module.exports = {
  getTimestamp: getTimestamp,
  OutlookAlerts: OutlookAlerts,
}