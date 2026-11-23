package com.plinthwell.roaamm.passkey;

/**
 * A passkey operation failed. {@code code} is a fixed snake_case constant sent
 * to the client; the cause is never shown or logged with its message.
 */
public class PasskeyException extends RuntimeException {

    private final int status;
    private final String code;

    public PasskeyException(int status, String code) {
        super(code, null, false, false);
        this.status = status;
        this.code = code;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}
