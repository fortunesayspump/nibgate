import { Resend } from 'resend';

let resendClient;

function configuredClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function csvIds(value = '') {
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function errorMessage(error) {
  if (!error) return 'Unknown Resend error';
  if (typeof error === 'string') return error;
  return error.message || error.name || JSON.stringify(error);
}

function isMissingContact(error) {
  const message = errorMessage(error).toLowerCase();
  return error?.statusCode === 404 || message.includes('not found');
}

function isDuplicateContact(error) {
  const message = errorMessage(error).toLowerCase();
  return error?.statusCode === 409 || message.includes('already') || message.includes('exist');
}

function contactProperties({ source }) {
  return {
    product: 'nibgate',
    source: source || 'footer'
  };
}

function segmentPayload() {
  return csvIds(process.env.RESEND_NEWSLETTER_SEGMENT_ID || process.env.RESEND_SEGMENT_ID).map(id => ({ id }));
}

function topicPayload() {
  return csvIds(process.env.RESEND_NEWSLETTER_TOPIC_ID || process.env.RESEND_TOPIC_ID).map(id => ({
    id,
    subscription: 'opt_in'
  }));
}

async function syncSegmentsAndTopics(resend, email) {
  const segmentIds = segmentPayload().map(segment => segment.id);
  const topics = topicPayload();

  await Promise.all([
    ...segmentIds.map(segmentId => resend.contacts.segments.add({ email, segmentId })),
    topics.length ? resend.contacts.topics.update({ email, topics }) : null
  ].filter(Boolean));
}

export async function syncNewsletterSubscriber({ email, source }) {
  const resend = configuredClient();

  if (!resend) {
    return {
      configured: false,
      synced: false,
      status: 'pending',
      error: 'RESEND_API_KEY is not configured'
    };
  }

  const properties = contactProperties({ source });
  const segments = segmentPayload();
  const topics = topicPayload();
  const createPayload = {
    email,
    unsubscribed: false,
    properties,
    ...(segments.length ? { segments } : {}),
    ...(topics.length ? { topics } : {})
  };

  const createResponse = await resend.contacts.create(createPayload);

  if (createResponse.data) {
    return {
      configured: true,
      synced: true,
      status: 'synced',
      contactId: createResponse.data.id
    };
  }

  if (!isDuplicateContact(createResponse.error)) {
    return {
      configured: true,
      synced: false,
      status: 'failed',
      error: errorMessage(createResponse.error)
    };
  }

  const updateResponse = await resend.contacts.update({
    email,
    unsubscribed: false,
    properties
  });

  if (!updateResponse.data && !isMissingContact(updateResponse.error)) {
    return {
      configured: true,
      synced: false,
      status: 'failed',
      error: errorMessage(updateResponse.error)
    };
  }

  if (updateResponse.data) {
    const segmentResponse = await syncSegmentsAndTopics(resend, email).then(
      () => ({ ok: true }),
      error => ({ ok: false, error })
    );

    if (!segmentResponse.ok) {
      return {
        configured: true,
        synced: false,
        status: 'failed',
        contactId: updateResponse.data.id,
        error: errorMessage(segmentResponse.error)
      };
    }

    return {
      configured: true,
      synced: true,
      status: 'synced',
      contactId: updateResponse.data.id
    };
  }

  return {
    configured: true,
    synced: false,
    status: 'failed',
    error: 'Resend contact could not be created or updated'
  };
}
