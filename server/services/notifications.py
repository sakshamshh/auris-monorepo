import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from twilio.rest import Client

logger = logging.getLogger("AurisCloud.notifications")

def send_access_request_email(name: str, message: str, store_id: str):
    """Sends an email notification using SMTP."""
    sender_email = os.getenv("SMTP_USER")
    sender_password = os.getenv("SMTP_PASSWORD")
    receiver_email = os.getenv("ADMIN_EMAIL", "support@skymlabs.com")
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))

    if not sender_email or not sender_password:
        logger.warning("SMTP credentials missing. Skipping email notification.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = receiver_email
        msg['Subject'] = f"Auris Access Request - {store_id or 'Unknown Store'}"

        body = f"Name: {name}\nStore ID: {store_id}\n\nMessage:\n{message}"
        msg.attach(MIMEText(body, 'plain'))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
        
        logger.info(f"Access request email sent for {store_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send access request email: {e}")
        return False


def send_access_request_whatsapp(name: str, message: str, store_id: str):
    """Sends a WhatsApp notification using Twilio."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_whatsapp = os.getenv("TWILIO_WHATSAPP_FROM")
    to_whatsapp = os.getenv("ADMIN_WHATSAPP")

    if not all([account_sid, auth_token, from_whatsapp, to_whatsapp]):
        logger.warning("Twilio credentials missing. Skipping WhatsApp notification.")
        return False

    try:
        client = Client(account_sid, auth_token)
        body = f"*Auris Access Request*\nName: {name}\nStore ID: {store_id}\n\n{message}"
        
        message = client.messages.create(
            body=body,
            from_=from_whatsapp,
            to=to_whatsapp
        )
        logger.info(f"Access request WhatsApp sent. SID: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send WhatsApp notification: {e}")
        return False
