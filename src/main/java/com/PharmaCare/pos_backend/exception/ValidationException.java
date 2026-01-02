package com.PharmaCare.pos_backend.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;
import org.springframework.validation.FieldError;

import java.util.List;

@Getter
public class ValidationException extends ApiException {
    private final List<FieldError> fieldErrors;

    public ValidationException(String message, List<FieldError> fieldErrors) {
        super(message, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
        this.fieldErrors = fieldErrors;
    }
}