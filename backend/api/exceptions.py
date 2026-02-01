"""
DroneCommand AI — Custom Exceptions
Tüm katmanlarda tutarlı hata yönetimi sağlar.
"""
from rest_framework.exceptions import APIException
from rest_framework import status


class DroneNotFound(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Belirtilen drone bulunamadı.'
    default_code = 'drone_not_found'


class DroneAlreadyRegistered(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Bu drone zaten kayıtlı.'
    default_code = 'drone_exists'


class ScanSessionNotFound(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Tarama oturumu bulunamadı.'
    default_code = 'scan_not_found'


class ScanAlreadyActive(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Bu drone için zaten aktif bir tarama var.'
    default_code = 'scan_active'


class RabbitMQError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Mesaj kuyruğu servisine bağlanılamadı.'
    default_code = 'rabbitmq_error'
