package com.PharmaCare.pos_backend.exception;

import org.springframework.http.HttpStatus;

public class UnauthorizedException extends com.PharmaCare.pos_backend.exception.ApiException {
    public UnauthorizedException(String message) {
        super(message, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
}