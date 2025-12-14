package com.PharmaCare.pos_backend.exception;

import org.springframework.http.HttpStatus;

public class InsufficientStockException extends ApiException {
    public InsufficientStockException(String medicineName, int available, int requested) {
        super(String.format("Insufficient stock for %s. Available: %d, Requested: %d",
                        medicineName, available, requested),
                HttpStatus.BAD_REQUEST,
                "INSUFFICIENT_STOCK");
    }
}